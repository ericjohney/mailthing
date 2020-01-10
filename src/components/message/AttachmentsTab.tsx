import React from "react";
import { Message } from "shared/Message";
import { Attachment } from "mailparser";
import Typography from "@material-ui/core/Typography";

interface Props {
  message: Message;
}

export function AttachmentsTab({ message }: Props) {
  const download = (attachment: Attachment) => {
    const a: HTMLAnchorElement = document.createElement("a");
    const file = new Blob([Buffer.from(attachment.content)], {
      type: attachment.contentType
    });
    a.href = URL.createObjectURL(file);
    a.download = attachment.filename || "";
    a.click();
  };

  return (
    <Typography component="div">
      {(message.parsed.attachments || []).map((attachment, i) => (
        <div key={i} onClick={() => download(attachment)}>
          <div>
            <strong>File:</strong> {attachment.filename}
          </div>
        </div>
      ))}
    </Typography>
  );
}
