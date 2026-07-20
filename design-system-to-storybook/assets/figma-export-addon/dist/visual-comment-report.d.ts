import { VisualMeeting, VisualMeetingFile } from './visual-comment-store.js';
import './visualComment-CktpX_T5.js';

declare function renderVisualCommentReport(meeting: VisualMeetingFile): string;
declare function renderVisualCommentIndex(meetings: VisualMeeting[], activeSessionId: string | null): string;

export { renderVisualCommentIndex, renderVisualCommentReport };
