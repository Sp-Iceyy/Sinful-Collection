# Sinful Collection

Sinful Collection is a private desktop application for organizing local images and videos.

## What It Does

- Creates separate profiles with separate media libraries.
- Imports individual files, batches of files, or an entire folder.
- Lets you edit titles, artists, tags, folders, and NSFW status.
- Organizes media by Favorites, Folders, and Artists.
- Supports video playback, seeking, mute, fullscreen, and ten-second skipping.
- Stores imported media in user-selected `Images` and `Videos` folders.
- Opens stored media in File Explorer and supports changing the storage location.

## Run the App

Install Node.js, then run:

```powershell
npm install
npm run dev
```

The app asks where imported media should be stored on first launch.

## Build a Windows installer

```powershell
npm run dist
```

Build files are created in `dist/`.

## Current local web mode

The fallback browser version can be started with:

```powershell
python server.py
```

Then open `http://localhost:8000/index.html`.

Browser mode copies uploaded files because browsers cannot move arbitrary files. The Electron desktop app supports moving originals.
