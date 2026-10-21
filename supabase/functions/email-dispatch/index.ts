// Sends an email message for the app (or records it in demo mode until the provider's keys are set).
// Who may send what, the message texts and the providers: see _shared/dispatchHandler.ts.
import { serveDispatch } from '../_shared/dispatchHandler.ts';

serveDispatch('email');
