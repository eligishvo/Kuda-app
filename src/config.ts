// App-wide constants. The departure airport becomes a setting in phase 2b (search setup).

/** This app's id in High Command (tickets are labelled app:kuda). */
export const APP_ID = 'kuda';

/** Where trips start from. Its country is shown as "home" on the map and can't be picked as a destination. */
export const DEPARTURE = { code: 'TLV', cc: 'IL', lon: 34.887, lat: 32.011 };

/** Where the map is centred when the app opens. */
export const START_VIEW = { lon: 34.8, lat: 31.5, zoom: 1 };
