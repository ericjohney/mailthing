import React from "react";
import { Message } from "shared/Message";
import Typography from "@material-ui/core/Typography";

interface Props {
  message: Message;
}

export function TextTab({ message }: Props) {
  return <Typography component="div">{message.parsed.text}</Typography>;
}
