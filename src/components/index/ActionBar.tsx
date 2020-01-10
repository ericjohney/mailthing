import React from "react";
import Link from "next/link";
import Router from "next/router";
import AppBar from "@material-ui/core/AppBar";
import Toolbar from "@material-ui/core/Toolbar";
import Checkbox from "@material-ui/core/Checkbox";
import IconButton from "@material-ui/core/IconButton";
import RefreshIcon from "@material-ui/icons/Refresh";
import ActionButtons from "./ActionButtons";
import { ComponentProps } from "../../pages/index";

export function ActionBar({
  messages,
  selectedMessageIds,
  setSelectedMessageIds
}: ComponentProps) {
  const onSelectAllClick = (_: any, isSelected: boolean) => {
    if (isSelected) {
      setSelectedMessageIds(messages.map(m => m.id));
      return;
    }
    setSelectedMessageIds([]);
  };

  const onActionButtonChange = (selectedMessageIds: number[]) => {
    setSelectedMessageIds(selectedMessageIds);
    Router.replace("/");
  };

  return (
    <AppBar position="static" color="default">
      <Toolbar>
        <Checkbox
          color="primary"
          indeterminate={
            selectedMessageIds.length > 0 &&
            selectedMessageIds.length < messages.length
          }
          checked={
            messages.length > 0 && selectedMessageIds.length === messages.length
          }
          onChange={onSelectAllClick}
        />
        <Link href="/" replace>
          <IconButton>
            <RefreshIcon />
          </IconButton>
        </Link>
        <ActionButtons
          selectedMessageIds={selectedMessageIds}
          onChanged={onActionButtonChange}
        />
      </Toolbar>
    </AppBar>
  );
}
