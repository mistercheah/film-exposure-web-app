Film Exposure Web App v3

What is new in this version
- Added lens compensation in stops
- Added effective ISO display
- Added highlight / shadow distribution analysis
- Added simple scene bias for high-contrast scenes
- Keeps image brightness analysis, filter compensation, and reciprocity adjustment

How to update on GitHub / Vercel
1. Unzip this package.
2. Open your GitHub repository.
3. Upload and replace:
   - index.html
   - styles.css
   - script.js
4. Commit the changes.
5. Vercel will redeploy automatically.

How lens compensation works
- Example: enter 2 if your lens is 2 stops slower
- Rated ISO stays as your intended EI
- App calculates Effective ISO = Rated ISO × 2^lens compensation

Local testing
- Open index.html in your browser.
