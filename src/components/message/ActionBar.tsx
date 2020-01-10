import React from "react";
import { Message } from "shared/Message";
import Link from "next/link";
import Typography from "@material-ui/core/Typography";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import IconButton from "@material-ui/core/IconButton";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";

interface Props {
  message: Message;
}

export function ActionBar({ message }: Props) {
  return (
    <AppBar position="static" color="default">
      <Toolbar>
        <Link href="/">
          <IconButton>
            <ArrowBackIcon />
          </IconButton>
        </Link>
        <Typography variant="subtitle1">{message.parsed.subject}</Typography>
      </Toolbar>
    </AppBar>
  );
}
