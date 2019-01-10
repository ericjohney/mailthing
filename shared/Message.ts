import { Entity, Column, PrimaryGeneratedColumn } from "typeorm";
import { ParsedMail } from "mailparser";

@Entity()
export class Message {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column("blob")
  raw!: Buffer;

  @Column("simple-json")
  parsed!: ParsedMail;
}
