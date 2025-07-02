# Home Directory Structure

This `home` folder simulates a real file system that the website can read and display.

## How it works:

### App Files
- Files named `app5`, `app7`, `app9`, `app10` (without extensions) are automatically recognized as apps
- The website looks up their details in `apps.json` using the filename as the app ID
- They will display with the correct name and icon from the apps.json file

### Example:
- File: `home/app5` → Displays as "Prism" with the app5 icon
- File: `home/app9` → Displays as "Manjarrow" with the app9 icon

### Real Files
- Any real files you add (like .mp3, .jpg, .txt) will automatically appear in the file manager
- For example: `home/Music/song.mp3` will show up when you browse to the Music folder

### Folders
The following folders are automatically recognized:
- `Documents/` - for text files, PDFs, office documents
- `Pictures/` - for images and graphics  
- `Downloads/` - for archives, installers, downloads
- `Projects/` - for code and development files
- `Music/` - for audio files
- `Videos/` - for video files

## Adding Content
Simply add any files to these folders and they'll automatically appear in the website's file manager!
