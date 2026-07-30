# Navidrome Subsonic API Analysis

## Source files (from navidrome/navidrome master branch)

This directory contains the key source files that determine how browsing works.

## Critical Findings

### 1. `getMusicDirectory` does NOT accept music folder IDs

From `get_entity.go`:
- `GetEntityByID` tries: Artist → Album → Playlist → MediaFile → Radio
- Music folders (Library) are NOT included in the lookup
- So `getMusicDirectory("1")` (numeric folder ID) always returns "Directory not found"

### 2. GetMusicDirectory only handles Artist and Album

From `browsing.go`:
- If the ID resolves to an **Artist**: returns albums as children (`isDir=true`)
- If the ID resolves to an **Album**: returns songs as children (`isDir=false`)
- Any other type returns "Directory not found"

### 3. Browsing hierarchy (simulated directory tree)

Navidrome explicitly does NOT support real browse-by-folder.
The documentation says:
> "Endpoints for this functionality (Ex: `getIndexes`, `getMusicDirectory`) returns a simulated directory tree, using the format: `/Artist/Album/01 - Song.mp3`"

The correct flow is:
```
getMusicFolders → getIndexes(musicFolderId) → artists (by letter)
                                              → getMusicDirectory(artistId) → albums (isDir=true)
                                                                           → getMusicDirectory(albumId) → songs (isDir=false)
```

### 4. `childFromAlbum` sets `IsDir=true`

Albums returned from an artist directory have `IsDir=true`, so clients should show them as clickable directories.

### 5. `childFromMediaFile` sets `IsDir=false`

Songs returned from an album directory have `IsDir=false`, so clients should show them as playable items.

## Current App Issues

### Issue 1: Music folder → shows artists (wrong?)
Actually this IS the correct Navidrome behavior. The user expects real folder browsing, but Navidrome doesn't support it. The fix should present the artist list in a way that feels like directory browsing, with proper back navigation.

### Issue 2: No hierarchical back navigation
The `goBack` function resets all state and goes to home. Need a view stack to support multi-level back navigation.

### Issue 3: Playlist crash
Unknown cause - need more investigation. Likely a data structure mismatch or FlatList issue.

## Proposed Solution

1. **View stack**: Track navigation history. Each `setView(newView)` pushes current view onto stack. `goBack` pops the stack.

2. **Music folder → artist listing**: Keep using `getIndexes`. Present artists with folder icons in a list view (not grid) to feel more like directory browsing.

3. **Artist → album listing**: Use `getMusicDirectory(artistId)` → directory view showing albums as subdirectories (isDir=true).

4. **Album → songs**: Use `getMusicDirectory(albumId)` → directory view showing songs (isDir=false).

5. **Back navigation**: View stack allows going back through the full chain: songs → album → artist → browseArtists → home.
