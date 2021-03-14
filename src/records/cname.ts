import { DNSRecordType, IRecord } from "./types.ts";

export class CNAMERecord implements IRecord {
  type: DNSRecordType = "CNAME";
  target: string;

  constructor(url: string) {
    if (typeof url !== "string")
      throw new Error("Expected qualified URL for CNAME Record");
    this.target = url;
  }
}
