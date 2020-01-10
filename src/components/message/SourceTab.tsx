import React from "react";
import { Message } from "shared/Message";
import Typography from "@material-ui/core/Typography";

interface Props {
  message: Message;
}

export function SourceTab({ message }: Props) {
  return (
    <Typography component="div">
      <pre>{Buffer.from(message.raw).toString()}</pre>
    </Typography>
  );
}
