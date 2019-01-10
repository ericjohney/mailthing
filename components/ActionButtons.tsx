import * as React from "react";
import axios from "axios";
import IconButton from "@material-ui/core/IconButton";
import SendIcon from "@material-ui/icons/Send";
import DeleteIcon from "@material-ui/icons/Delete";

interface Props {
  selectedMessageIds: Set<number>;
  onChanged: (selectedMessageIds: Set<number>) => any;
}

export default class extends React.Component<Props> {
  onSend = async () => {
    const { selectedMessageIds } = this.props;
    await axios.post("http://localhost:9005/api/messages/send", {
      messageIds: Array.from(selectedMessageIds.values())
    });
  };

  onDelete = async () => {
    const { selectedMessageIds, onChanged } = this.props;
    await axios.post("http://localhost:9005/api/messages/delete", {
      messageIds: Array.from(selectedMessageIds.values())
    });
    const newSelectedIds = new Set();
    onChanged(newSelectedIds);
  };

  render() {
    const { selectedMessageIds } = this.props;
    if (selectedMessageIds.size === 0) {
      return null;
    }
    return (
      <>
        <IconButton onClick={this.onSend}>
          <SendIcon />
        </IconButton>
        <IconButton onClick={this.onDelete}>
          <DeleteIcon />
        </IconButton>
      </>
    );
  }
}
