import { VisualMeetingSummary, VisualMeetingFile, VisualCommentReportRenderContext } from './visual-comment-store.js';
import './visualComment-Diazst2e.js';

declare function renderVisualCommentReport(meeting: VisualMeetingFile, context?: VisualCommentReportRenderContext): string;
declare function renderVisualCommentIndex(meetings: VisualMeetingSummary[], activeSessionId: string | null): string;

export { renderVisualCommentIndex, renderVisualCommentReport };
