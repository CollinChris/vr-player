# Publishing VR Player

## Option A: GitHub Releases (free and quick)

1. Push this folder to a public GitHub repository.
2. Create and push a version tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

3. The **Build & release** workflow builds the installer and the portable exe and attaches them to a Release.
4. Share the release link: `https://github.com/<you>/<repo>/releases/latest`.

## Option B: Microsoft Store

1. **Create a developer account.** Sign up at https://partner.microsoft.com/dashboard. Individual registration is free, but you'll need to verify your identity.
2. **Reserve the app name.** In Partner Center, go to **Apps and games → New product → MSIX or PWA app** and reserve **"VR Player"**. If that name is taken, pick another one and update `productName` in `package.json`.
3. **Copy your app's identity.** Go to **Product management → Product identity** and copy:
   - `Package/Identity/Name`, which looks like `12345Collin.VRPlayer`
   - `Package/Identity/Publisher`, which looks like `CN=XXXXXXXX-XXXX-...`
   - `Package/Properties/PublisherDisplayName`
4. **Add them as GitHub repository variables.** In the repo, go to **Settings → Secrets and variables → Actions → Variables** and add:
   - `APPX_IDENTITY_NAME`
   - `APPX_PUBLISHER`
   - `APPX_PUBLISHER_DISPLAY_NAME`

   Then go to **Actions → Build & release → Run workflow**. The `.appx` file will be in the run's downloadable artifacts. You don't need to sign it, because the Store signs it for you.
5. **Submit the app.** Create a submission in Partner Center and upload the `.appx` under **Packages**. Fill in the store listing using the details below.

### Store listing draft

**Name:** VR Player

**Short description:** Watch VR180 and 360° videos on your PC. Drag to look around, with VLC-style controls.

**Description:**
VR Player lets you watch VR180 and 360° videos on a normal monitor, with no headset needed. Drag with your mouse to look around the scene and scroll to zoom in and out. The controls work the way you're used to from desktop video players.

- Supports 180° and 360° videos in side-by-side, top-bottom and mono formats
- Drag to look around, and scroll to zoom
- Volume boost up to 200%
- Scroll over the timeline to skip forward or back
- Remembers where you stopped in each video
- Works offline, with no ads and no tracking

**Category:** Multimedia design → Video, or Entertainment

**Keywords:** VR video player, 360 video, VR180, 180 video, side by side, SBS, panorama video

**Privacy policy URL:** link to PRIVACY.md in your repository, for example `https://github.com/<you>/<repo>/blob/main/PRIVACY.md`

**Age rating:** fill in the IARC questionnaire. It's a general-purpose media player with no content of its own and no user interaction or online features.

**Screenshots:** at least one 1920×1080 PNG. Use general VR travel or nature footage only. Store policy rejects listings that show or suggest adult content.

**Capabilities:** `runFullTrust` (standard for desktop apps; electron-builder adds it automatically).
