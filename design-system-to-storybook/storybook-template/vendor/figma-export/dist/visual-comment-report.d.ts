import { VisualMeetingSummary, VisualMeetingFile, VisualCommentReportRenderContext } from './visual-comment-store.js';
import './visualComment-CG4UoVVu.js';

declare function renderVisualCommentReport(meeting: VisualMeetingFile, context?: VisualCommentReportRenderContext): string;
declare function renderVisualCommentIndex(meetings: VisualMeetingSummary[], activeSessionId: string | null): string;

export { renderVisualCommentIndex, renderVisualCommentReport };
