// This file contains helpers used by browsing.go:
// - newResponse, newError, subError
// - childFromMediaFile (song item, isDir=false)
// - childFromAlbum (album item, isDir=true)
// - buildAlbumID3, buildOSAlbumID3
// - getUserAccessibleLibraries, selectedMusicFolderIds
// - fakePath (returns "Artist/Album/01 - Song.mp3" format)
// - toArtist, toArtistID3, etc.

// Key details for our use:
// - childFromAlbum: IsDir=true, Title=album.FullName(), Id=album.ID, Parent=artistID
// - childFromMediaFile: IsDir=false, Title=mf.FullTitle(), Id=mf.ID, Parent=albumID
// - fakePath: format "Artist/Album/01 - Song.mp3" for simulated directory tree
