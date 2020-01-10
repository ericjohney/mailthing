import React from "react";
import Link from "next/link";
import { DateTime } from "luxon";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableRow from "@material-ui/core/TableRow";
import Checkbox from "@material-ui/core/Checkbox";
import { ComponentProps } from "../../pages/index";

export function MessageList({
  messages,
  selectedMessageIds,
  setSelectedMessageIds
}: ComponentProps) {
  const onMessageSelectChange = (id: number, isSelected: boolean) => {
    const newSelectedIds = new Set(selectedMessageIds);
    if (isSelected) {
      newSelectedIds.add(id);
    } else {
      newSelectedIds.delete(id);
    }
    setSelectedMessageIds(Array.from(newSelectedIds));
  };

  const idSet = new Set(selectedMessageIds);

  return (
    <Table>
      <TableBody>
        {messages.reverse().map(message => (
          <Link
            key={message.id}
            href={{ pathname: "/message", query: { id: message.id } }}
            as={`/message/${message.id}`}
          >
            <TableRow style={{ cursor: "pointer" }}>
              <TableCell onClick={event => event.stopPropagation()}>
                <Checkbox
                  color="primary"
                  checked={idSet.has(message.id)}
                  value={message.id.toString()}
                  onChange={(event, isSelected) =>
                    onMessageSelectChange(message.id, isSelected)
                  }
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
  );
}
