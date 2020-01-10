import * as React from "react";
import axios from "axios";
import IconButton from "@material-ui/core/IconButton";
import SendIcon from "@material-ui/icons/Send";
import DeleteIcon from "@material-ui/icons/Delete";

interface Props {
  selectedMessageIds: number[];
  onChanged: (selectedMessageIds: number[]) => any;
}

export default function ActionButtons({
  selectedMessageIds,
  onChanged
}: Props) {
  const onSend = async () => {
    await axios.post("http://localhost:9005/api/messages/send", {
      messageIds: selectedMessageIds
    });
  };

  const onDelete = async () => {
    await axios.post("http://localhost:9005/api/messages/delete", {
      messageIds: selectedMessageIds
    });
    onChanged([]);
  };

  if (selectedMessageIds.length === 0) {
    return null;
  }
  return (
    <>
      <IconButton onClick={onSend}>
        <SendIcon />
      </IconButton>
      <IconButton onClick={onDelete}>
        <DeleteIcon />
      </IconButton>
    </>
  );
}
