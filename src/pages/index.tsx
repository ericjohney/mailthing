import React, { useState } from "react";
import axios from "axios";
import { Message } from "shared/Message";
import Paper from "@material-ui/core/Paper";

import { ActionBar } from "../components/index/ActionBar";
import { MessageList } from "../components/index/MessageList";

interface Props {
  messages: Message[];
}

export interface ComponentProps {
  messages: Message[];
  selectedMessageIds: number[];
  setSelectedMessageIds: (ids: number[]) => any;
}

export default function Index({ messages }: Props) {
  const [selectedMessageIds, setSelectedMessageIds] = useState<number[]>([]);

  return (
    <Paper>
      <ActionBar
        messages={messages}
        selectedMessageIds={selectedMessageIds}
        setSelectedMessageIds={setSelectedMessageIds}
      />
      <MessageList
        messages={messages}
        selectedMessageIds={selectedMessageIds}
        setSelectedMessageIds={setSelectedMessageIds}
      />
    </Paper>
  );
}

Index.getInitialProps = async () => {
  const res = await axios.get("http://localhost:9005/api/messages");
  return res.data;
};
