import * as React from "react";
import axios from "axios";
import { Message } from "shared/Message";
import Link from "next/link";
import Router from "next/router";
import { DateTime } from "luxon";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Checkbox from "@material-ui/core/Checkbox";
import IconButton from "@material-ui/core/IconButton";
import RefreshIcon from "@material-ui/icons/Refresh";

import ActionButtons from "../components/ActionButtons";

interface Props {
  messages: Message[];
}
interface State {
  selectedMessageIds: Set<number>;
}

export default class extends React.Component<Props, State> {
  static async getInitialProps() {
    const res = await axios.get("http://localhost:9005/api/messages");
    return res.data;
  }

  state = {
    selectedMessageIds: new Set()
  };

  onSelectAllClick = (_: any, isSelected: boolean) => {
    const { messages } = this.props;
    if (isSelected) {
      this.setState({ selectedMessageIds: new Set(messages.map(m => m.id)) });
      return;
    }
    this.setState({ selectedMessageIds: new Set() });
  };

  onActionButtonChange = (selectedMessageIds: Set<number>) => {
    this.setState({ selectedMessageIds });
    Router.replace("/");
  };

  renderActions() {
    const { messages } = this.props;
    const { selectedMessageIds } = this.state;
    return (
      <AppBar position="static" color="default">
        <Toolbar>
          <Checkbox
            color="primary"
            indeterminate={
              selectedMessageIds.size > 0 &&
              selectedMessageIds.size < messages.length
            }
            checked={
              messages.length > 0 && selectedMessageIds.size === messages.length
            }
            onChange={this.onSelectAllClick}
          />
          <Link href="/" replace>
            <IconButton>
              <RefreshIcon />
            </IconButton>
          </Link>
          <ActionButtons
            selectedMessageIds={selectedMessageIds}
            onChanged={this.onActionButtonChange}
          />
        </Toolbar>
      </AppBar>
    );
  }

  onMessageSelectChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    isSelected: boolean
  ) => {
    const id = parseInt(event.target.value, 10);
    const { selectedMessageIds } = this.state;
    const newSelectedIds = new Set(selectedMessageIds);

    if (isSelected) {
      newSelectedIds.add(id);
    } else {
      newSelectedIds.delete(id);
    }
    this.setState({
      selectedMessageIds: newSelectedIds
    });
  };

  render() {
    const { selectedMessageIds } = this.state;
    const messages = [...this.props.messages].reverse();
    return (
      <Paper>
        {this.renderActions()}
        <Table>
          <TableBody>
            {messages.map(message => (
              <Link
                key={message.id}
                href={{ pathname: "/message", query: { id: message.id } }}
                as={`/message/${message.id}`}
              >
                <TableRow style={{ cursor: "pointer" }}>
                  <TableCell
                    onClick={(event: React.MouseEvent<HTMLTableCellElement>) =>
                      event.stopPropagation()
                    }
                  >
                    <Checkbox
                      color="primary"
                      checked={selectedMessageIds.has(message.id)}
                      value={message.id.toString()}
                      onChange={this.onMessageSelectChange}
                    />
                  </TableCell>
                  <TableCell>
                    {message.parsed.date
                      ? DateTime.fromISO(
                          message.parsed.date.toString()
                        ).toLocaleString(DateTime.DATETIME_SHORT)
                      : ""}
                  </TableCell>
                  <TableCell>{message.parsed.from.text}</TableCell>
                  <TableCell>{message.parsed.subject}</TableCell>
                </TableRow>
              </Link>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
  }
}
