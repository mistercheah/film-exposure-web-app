Film Exposure Web App v4

What is new in this version
- Converts long exposure times from seconds into minutes and seconds
- Keeps lens compensation in stops
- Keeps effective ISO display
- Keeps highlight / shadow distribution analysis
- Keeps simple scene bias for high-contrast scenes
- Keeps image brightness analysis, filter compensation, and reciprocity adjustment

Examples
- 120 sec becomes 2 min
- 135 sec becomes 2 min 15 sec
- 8 sec stays 8 sec
- Fast shutter speeds still show as fractions like 1/125 sec

How to update on GitHub / Vercel
1. Unzip this package.
2. Open your GitHub repository.
3. Upload and replace:
   - index.html
   - styles.css
   - script.js
   - README.txt
4. Commit the changes.
5. Vercel will redeploy automatically.

How lens compensation works
- Example: enter 2 if your lens is 2 stops slower
- Rated ISO stays as your intended EI
- App calculates Effective ISO = Rated ISO × 2^lens compensation

Local testing
- Open index.html in your browser.
