import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Image as ImageIcon,
  Paperclip,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fileSize } from '../api';
import { Button, IconButton, Modal } from '../design-system';
import { usePreviewWidth } from './usePreviewWidth';
import type { Attachment } from '../types';

const PdfPreview = lazy(() => import('./PdfPreview'));
export const attachmentUrl = (attachment: Attachment) =>
  `/api/attachments/${encodeURIComponent(attachment.id)}`;

export function previewKind(attachment: Attachment): 'pdf' | 'image' | null {
  const mime = attachment.content_type.split(';')[0].trim().toLowerCase();
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (!mime || mime === 'application/octet-stream') {
    if (/\.pdf$/i.test(attachment.name)) return 'pdf';
    if (/\.(png|jpe?g|gif|webp|bmp|avif|svg|ico|tiff?|hei[cf])$/i.test(attachment.name))
      return 'image';
  }
  return null;
}

export function AttachmentCard({
  attachment,
  onPreview,
}: {
  attachment: Attachment;
  onPreview: (attachment: Attachment) => void;
}) {
  const kind = previewKind(attachment);
  const content = (
    <>
      <span className="attachment-icon">
        {kind === 'pdf' ? (
          <FileText size={24} />
        ) : kind === 'image' ? (
          <ImageIcon size={24} />
        ) : (
          <Paperclip size={24} />
        )}
      </span>
      <span className="attachment-description">
        <strong>{attachment.name}</strong>
        <small>{fileSize(attachment.size)}</small>
      </span>
      {kind ? <Eye size={17} /> : <Download size={17} />}
    </>
  );
  return (
    <div className="attachment-card">
      {kind ? (
        <>
          <button
            type="button"
            className="attachment-open"
            aria-label={`Preview ${attachment.name}`}
            onClick={() => onPreview(attachment)}
          >
            {content}
          </button>
          <a
            className="icon-button attachment-download"
            href={attachmentUrl(attachment)}
            download={attachment.name}
            aria-label={`Download ${attachment.name}`}
            title={`Download ${attachment.name}`}
          >
            <Download size={17} />
          </a>
        </>
      ) : (
        <a
          className="attachment-open"
          href={attachmentUrl(attachment)}
          download={attachment.name}
          aria-label={`Download ${attachment.name}`}
        >
          {content}
        </a>
      )}
    </div>
  );
}

export function AttachmentPreview({
  attachment,
  onClose,
}: {
  attachment: Attachment;
  onClose: () => void;
}) {
  const [data, setData] = useState<ArrayBuffer>();
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setData(undefined);
    fetch(attachmentUrl(attachment), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load attachment');
        const buffer = await response.arrayBuffer();
        if (!controller.signal.aborted) setData(buffer);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attachment.id, attempt]);
  return (
    <Modal title={attachment.name} onClose={onClose} className="attachment-preview">
      <div className="attachment-preview-toolbar">
        <div className="attachment-zoom-controls">
          <IconButton
            label="Zoom out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
          >
            <ZoomOut size={18} />
          </IconButton>
          <Button variant="ghost" size="sm" onClick={() => setZoom(1)} aria-label="Fit to width">
            {Math.round(zoom * 100)}%
          </Button>
          <IconButton
            label="Zoom in"
            disabled={zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 0.25))}
          >
            <ZoomIn size={18} />
          </IconButton>
        </div>
        <a
          className="button button-secondary button-sm"
          href={attachmentUrl(attachment)}
          download={attachment.name}
        >
          <Download size={16} />
          Download
        </a>
      </div>
      {error ? (
        <div className="attachment-preview-message" role="alert">
          <p>Couldn’t load this attachment.</p>
          <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
        </div>
      ) : data ? (
        previewKind(attachment) === 'pdf' ? (
          <Suspense
            fallback={
              <p className="attachment-preview-message" role="status">
                Loading PDF viewer…
              </p>
            }
          >
            <PdfPreview data={data} zoom={zoom} />
          </Suspense>
        ) : (
          <ImagePreview data={data} attachment={attachment} zoom={zoom} />
        )
      ) : (
        <p className="attachment-preview-message" role="status">
          Loading attachment…
        </p>
      )}
    </Modal>
  );
}

function ImagePreview({
  data,
  attachment,
  zoom,
}: {
  data: ArrayBuffer;
  attachment: Attachment;
  zoom: number;
}) {
  const [url, setUrl] = useState('');
  const [naturalWidth, setNaturalWidth] = useState(0);
  const [failed, setFailed] = useState(false);
  const { ref, width } = usePreviewWidth();
  useEffect(() => {
    const source = URL.createObjectURL(new Blob([data], { type: attachment.content_type }));
    setUrl(source);
    return () => URL.revokeObjectURL(source);
  }, [data, attachment.content_type]);
  return (
    <div className="attachment-preview-viewport" ref={ref}>
      {failed ? (
        <p className="attachment-preview-message" role="alert">
          This image can’t be previewed. You can download it instead.
        </p>
      ) : (
        url && (
          <img
            src={url}
            alt={attachment.name}
            className="attachment-preview-image"
            style={{ width: Math.min(naturalWidth || width, width) * zoom }}
            onLoad={(event) => setNaturalWidth(event.currentTarget.naturalWidth)}
            onError={() => setFailed(true)}
          />
        )
      )}
    </div>
  );
}
