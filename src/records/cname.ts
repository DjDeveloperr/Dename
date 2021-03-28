import { DNSRecordType, IRecord } from "./types.ts";
import {validateNsName} from "../validators.ts";

export class CNAMERecord implements IRecord {
  type: DNSRecordType = "CNAME";
  target: string;

  constructor(url: string) {
    if (typeof url !== "string")
      throw new Error("Expected qualified URL for CNAME Record");
    if(!validateNsName(url))
      throw new Error("Expected valid FQDN for CNAME Record");
    this.target = url;
  }
}
