import * as React from "react";
import axios from "axios";
import { Message } from "shared/Message";
import { NextContext } from "next";
import Link from "next/link";
import { DateTime } from "luxon";
import { Attachment } from "mailparser";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import IconButton from "@material-ui/core/IconButton";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";

interface Props {
  id: string;
  message: Message;
}
interface State {
  activeTab: string;
}

export default class extends React.Component<Props, State> {
  static async getInitialProps(ctx: NextContext) {
    const id = ctx.query.id;
    const res = await axios.get(`http://localhost:9005/api/message/${id}`);
    return {
      message: res.data.message
    };
  }

  state = {
    activeTab: "html"
  };

  toggle(activeTab: string) {
    this.setState({ activeTab });
  }

  download(attachment: Attachment) {
    const a: HTMLAnchorElement = document.createElement("a");
    const file = new Blob([Buffer.from(attachment.content)], {
      type: attachment.contentType
    });
    a.href = URL.createObjectURL(file);
    a.download = attachment.filename || "";
    a.click();
  }

  renderActions() {
    const { message } = this.props;
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

  render() {
    const { message } = this.props;
    const { activeTab } = this.state;
    return (
      <Paper>
        {this.renderActions()}
        <Tabs
          value={activeTab}
          onChange={(_, value) => {
            this.toggle(value);
          }}
        >
          <Tab label="HTML" value="html" />
          <Tab label="Text" value="text" />
          <Tab label="Source" value="source" />
          <Tab label="Attachments" value="attachments" />
        </Tabs>
        {activeTab === "html" && (
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
                ? DateTime.fromISO(
                    message.parsed.date.toString()
                  ).toLocaleString(DateTime.DATETIME_SHORT)
                : ""}
            </div>
            <iframe
              src={`http://localhost:9005/api/message/${message.id}/html`}
              style={{ width: "100%", height: "600px" }}
            />
          </Typography>
        )}
        {activeTab === "text" && (
          <Typography component="div">{message.parsed.text}</Typography>
        )}
        {activeTab === "source" && (
          <Typography component="div">
            <pre>{Buffer.from(message.raw).toString()}</pre>
          </Typography>
        )}
        {activeTab === "attachments" && (
          <Typography component="div">
            {(message.parsed.attachments || []).map((attachment, i) => (
              <div key={i} onClick={() => this.download(attachment)}>
                <div>
                  <strong>File:</strong> {attachment.filename}
                </div>
              </div>
            ))}
          </Typography>
        )}
      </Paper>
    );
  }
}
