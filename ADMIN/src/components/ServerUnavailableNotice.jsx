import { SERVER_UNAVAILABLE_MESSAGE, isServerUnavailableError } from '../api';
import './ServerUnavailableNotice.css';

export function ServerUnavailableNotice({ error, onRetry, disabled = false }) {
  if (!isServerUnavailableError(error) && error?.message !== SERVER_UNAVAILABLE_MESSAGE) return null;
  return <div className="server-unavailable" role="alert">
    <p>{SERVER_UNAVAILABLE_MESSAGE}</p>
    <button type="button" onClick={onRetry} disabled={disabled}>Retry</button>
  </div>;
}
