import React from "react";
import { Message } from "shared/Message";
import { DateTime } from "luxon";
import Typography from "@material-ui/core/Typography";

interface Props {
  message: Message;
}

export function HtmlTab({ message }: Props) {
  return (
    <Typography component="div">
      <div>
        <strong>To:</strong> {message.parsed.to.text}
      </div>
      <div>
        <strong>From:</strong> {message.parsed.from.text}
      </div>
      <div>
        <strong>Subject:</strong> {message.parsed.subject}
      </div>
      <div>
        <strong>Date:</strong>{" "}
        {message.parsed.date
          ? DateTime.fromISO(message.parsed.date.toString()).toLocaleString(
              DateTime.DATETIME_SHORT
            )
          : ""}
      </div>
      <iframe
        src={`http://localhost:9005/api/message/${message.id}/html`}
        style={{ width: "100%", height: "600px" }}
      />
    </Typography>
  );
}
