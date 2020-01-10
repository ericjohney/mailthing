import React, { useState } from "react";
import axios from "axios";
import { Message } from "shared/Message";
import { NextPageContext } from "next";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Paper from "@material-ui/core/Paper";
import { ActionBar } from "../components/message/ActionBar";
import { AttachmentsTab } from "../components/message/AttachmentsTab";
import { SourceTab } from "../components/message/SourceTab";
import { TextTab } from "../components/message/TextTab";
import { HtmlTab } from "../components/message/HtmlTab";

interface Props {
  id: string;
  message: Message;
}

export default function MessageComponent({ message }: Props) {
  const [activeTab, setActiveTab] = useState("html");

  return (
    <Paper>
      <ActionBar message={message} />
      <Tabs
        value={activeTab}
        onChange={(_, value) => {
          setActiveTab(value);
        }}
      >
        <Tab label="HTML" value="html" />
        <Tab label="Text" value="text" />
        <Tab label="Source" value="source" />
        <Tab label="Attachments" value="attachments" />
      </Tabs>
      {activeTab === "html" && <HtmlTab message={message} />}
      {activeTab === "text" && <TextTab message={message} />}
      {activeTab === "source" && <SourceTab message={message} />}
      {activeTab === "attachments" && <AttachmentsTab message={message} />}
    </Paper>
  );
}

MessageComponent.getInitialProps = async (ctx: NextPageContext) => {
  const id = ctx.query.id;
  const res = await axios.get(`http://localhost:9005/api/message/${id}`);
  return {
    message: res.data.message
  };
};
