Film Exposure Web App v8

What is new in this version
- Practical exposure is now displayed first in the result card
- Calculated exposure is shown below it
- Save Result and Save Settings moved to the result screen
- Added Export Result and Export History on the result screen
- Export includes all major inputs, scene analysis, outputs, and metadata
- Current version shown in the app: v8.0

What export includes
- Film details
- Film ID / Location
- Rated ISO and effective ISO
- Lens compensation
- Filter information
- Lighting source and scene EV
- Highlight / shadow / contrast analysis
- Metered exposure
- Calculated exposure
- Practical exposure
- Reciprocity status
- Timestamp and app version

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

Local device storage
- Settings are stored in localStorage under filmMeterSettings
- Saved results are stored in localStorage under filmMeterHistory
