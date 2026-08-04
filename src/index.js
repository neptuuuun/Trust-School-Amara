import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
// NOTE: React.StrictMode is intentionally disabled. In dev it double-mounts every
// effect, which rapidly subscribes/unsubscribes our many Firestore onSnapshot
// listeners. That churn races a known bug in the Firebase SDK's watch-stream
// aggregator and triggers `INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)`
// (firebase-js-sdk#9267). Re-enable once the SDK ships a fix.
// The app is Arabic-only; there is no i18n layer.
root.render(<App />);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
