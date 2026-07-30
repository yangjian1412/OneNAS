package subsonic

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/navidrome/navidrome/conf"
	"github.com/navidrome/navidrome/consts"
	"github.com/navidrome/navidrome/core/publicurl"
	"github.com/navidrome/navidrome/log"
	"github.com/navidrome/navidrome/model"
	"github.com/navidrome/navidrome/server/filter"
	"github.com/navidrome/navidrome/server/subsonic/responses"
	"github.com/navidrome/navidrome/utils/req"
	"github.com/navidrome/navidrome/utils/slice"
)

func (api *Router) GetMusicFolders(r *http.Request) (*responses.Subsonic, error) {
	libraries := getUserAccessibleLibraries(r.Context())

	folders := make([]responses.MusicFolder, len(libraries))
	for i, f := range libraries {
		folders[i].Id = int32(f.ID)
		folders[i].Name = f.Name
	}
	response := newResponse()
	response.MusicFolders = &responses.MusicFolders{Folders: folders}
	return response, nil
}

func (api *Router) getArtist(r *http.Request, libIds []int, ifModifiedSince time.Time) (model.ArtistIndexes, int64, error) {
	ctx := r.Context()

	lastScanStr, err := api.ds.Property(ctx).DefaultGet(consts.LastScanStartTimeKey, "")
	if err != nil {
		log.Error(ctx, "Error retrieving last scan start time", err)
		return nil, 0, err
	}
	lastScan := time.Now()
	if lastScanStr != "" {
		lastScan, err = time.Parse(time.RFC3339, lastScanStr)
	}

	var indexes model.ArtistIndexes
	if lastScan.After(ifModifiedSince) {
		indexes, err = api.ds.Artist(ctx).GetIndex(false, libIds, model.RoleAlbumArtist)
		if err != nil {
			log.Error(ctx, "Error retrieving Indexes", err)
			return nil, 0, err
		}
		if len(indexes) == 0 {
			log.Debug(ctx, "No artists found in library", "libId", libIds)
			return nil, 0, newError(responses.ErrorDataNotFound, "Library not found or empty")
		}
	}

	return indexes, lastScan.UnixMilli(), err
}

func (api *Router) getArtistIndex(r *http.Request, libIds []int, ifModifiedSince time.Time) (*responses.Indexes, error) {
	indexes, modified, err := api.getArtist(r, libIds, ifModifiedSince)
	if err != nil {
		return nil, err
	}

	res := &responses.Indexes{
		IgnoredArticles: conf.Server.IgnoredArticles,
		LastModified:    modified,
	}

	res.Index = make([]responses.Index, len(indexes))
	for i, idx := range indexes {
		res.Index[i].Name = idx.ID
		res.Index[i].Artists = slice.MapWithArg(idx.Artists, r, toArtist)
	}
	return res, nil
}

func (api *Router) getArtistIndexID3(r *http.Request, libIds []int, ifModifiedSince time.Time) (*responses.Artists, error) {
	indexes, modified, err := api.getArtist(r, libIds, ifModifiedSince)
	if err != nil {
		return nil, err
	}

	res := &responses.Artists{
		IgnoredArticles: conf.Server.IgnoredArticles,
		LastModified:    modified,
	}

	res.Index = make([]responses.IndexID3, len(indexes))
	for i, idx := range indexes {
		res.Index[i].Name = idx.ID
		res.Index[i].Artists = slice.MapWithArg(idx.Artists, r, toArtistID3)
	}
	return res, nil
}

func (api *Router) GetIndexes(r *http.Request) (*responses.Subsonic, error) {
	p := req.Params(r)
	musicFolderIds, _ := selectedMusicFolderIds(r, false)
	ifModifiedSince := p.TimeOr("ifModifiedSince", time.Time{})

	res, err := api.getArtistIndex(r, musicFolderIds, ifModifiedSince)
	if err != nil {
		return nil, err
	}

	response := newResponse()
	response.Indexes = res
	return response, nil
}

func (api *Router) GetArtists(r *http.Request) (*responses.Subsonic, error) {
	musicFolderIds, _ := selectedMusicFolderIds(r, false)

	res, err := api.getArtistIndexID3(r, musicFolderIds, time.Time{})
	if err != nil {
		return nil, err
	}

	response := newResponse()
	response.Artist = res
	return response, nil
}

// ============================================================
// KEY FUNCTION: GetMusicDirectory
// ============================================================
// Accepts an ID and looks it up via model.GetEntityByID.
// Only handles:
//   - *model.Artist -> buildArtistDirectory (shows albums as children with isDir=true)
//   - *model.Album  -> buildAlbumDirectory  (shows songs as children with isDir=false)
//
// Music folder IDs (numeric, from GetMusicFolders) are NOT supported.
// Will return "Directory not found" for any other entity type or unknown ID.
// ============================================================
func (api *Router) GetMusicDirectory(r *http.Request) (*responses.Subsonic, error) {
	p := req.Params(r)
	id, _ := p.String("id")
	ctx := r.Context()

	entity, err := model.GetEntityByID(ctx, api.ds, id)
	if errors.Is(err, model.ErrNotFound) {
		log.Error(r, "Requested ID not found ", "id", id)
		return nil, newError(responses.ErrorDataNotFound, "Directory not found")
	}
	if err != nil {
		log.Error(err)
		return nil, err
	}

	var dir *responses.Directory

	switch v := entity.(type) {
	case *model.Artist:
		dir, err = api.buildArtistDirectory(ctx, v)
	case *model.Album:
		dir, err = api.buildAlbumDirectory(ctx, v)
	default:
		log.Error(r, "Requested ID of invalid type", "id", id, "entity", v)
		return nil, newError(responses.ErrorDataNotFound, "Directory not found")
	}

	if err != nil {
		log.Error(err)
		return nil, err
	}

	response := newResponse()
	response.Directory = dir
	return response, nil
}

// buildArtistDirectory: Given an Artist, returns its albums as child entries (isDir=true)
func (api *Router) buildArtistDirectory(ctx context.Context, artist *model.Artist) (*responses.Directory, error) {
	dir := &responses.Directory{}
	dir.Id = artist.ID
	dir.Name = artist.Name
	dir.PlayCount = artist.PlayCount
	if artist.PlayCount > 0 {
		dir.Played = artist.PlayDate
	}
	dir.AlbumCount = getArtistAlbumCount(artist)
	dir.UserRating = int32(artist.Rating)
	if conf.Server.Subsonic.EnableAverageRating {
		dir.AverageRating = artist.AverageRating
	}
	if artist.Starred {
		dir.Starred = artist.StarredAt
	}

	albums, err := api.ds.Album(ctx).GetAll(filter.AlbumsByArtistID(artist.ID))
	if err != nil {
		return nil, err
	}

	dir.Child = slice.MapWithArg(albums, ctx, childFromAlbum)
	return dir, nil
}

// buildAlbumDirectory: Given an Album, returns its tracks as child entries (isDir=false)
func (api *Router) buildAlbumDirectory(ctx context.Context, album *model.Album) (*responses.Directory, error) {
	dir := &responses.Directory{}
	dir.Id = album.ID
	dir.Name = album.FullName()
	dir.Parent = album.AlbumArtistID
	dir.PlayCount = album.PlayCount
	if album.PlayCount > 0 {
		dir.Played = album.PlayDate
	}
	dir.UserRating = int32(album.Rating)
	if conf.Server.Subsonic.EnableAverageRating {
		dir.AverageRating = album.AverageRating
	}
	dir.SongCount = int32(album.SongCount)
	dir.CoverArt = album.CoverArtID().String()
	if album.Starred {
		dir.Starred = album.StarredAt
	}

	mfs, err := api.ds.MediaFile(ctx).GetAll(filter.SongsByAlbum(album.ID))
	if err != nil {
		return nil, err
	}

	dir.Child = slice.MapWithArg(mfs, ctx, childFromMediaFile)
	return dir, nil
}

func (api *Router) buildAlbum(ctx context.Context, album *model.Album, mfs model.MediaFiles) *responses.AlbumWithSongsID3 {
	dir := &responses.AlbumWithSongsID3{}
	dir.AlbumID3 = buildAlbumID3(ctx, *album)
	dir.Song = slice.MapWithArg(mfs, ctx, childFromMediaFile)
	return dir
}
