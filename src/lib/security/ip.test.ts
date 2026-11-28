import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPublicAddress } from "./ip";

describe("isPublicAddress", () => {
  it("allows ordinary public IPv4 addresses", () => {
    for (const address of ["8.8.8.8", "1.1.1.1", "93.184.216.34", "172.32.0.1", "100.63.255.255"]) {
      assert.equal(isPublicAddress(address), true, address);
    }
  });

  it("blocks private, loopback, link-local and reserved IPv4 ranges", () => {
    const blocked = [
      "0.0.0.0",
      "10.0.0.1",
      "10.255.255.255",
      "100.64.0.1",
      "127.0.0.1",
      "127.255.255.254",
      "169.254.169.254",
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.19.255.255",
      "203.0.113.5",
      "224.0.0.1",
      "240.0.0.1",
      "255.255.255.255",
    ];
    for (const address of blocked) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it("allows global unicast IPv6 and blocks everything else", () => {
    assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
    assert.equal(isPublicAddress("2001:4860:4860::8888"), true);

    const blocked = [
      "::",
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456:789a::1",
      "ff02::1",
      "2001:db8::1",
      "2001::1",
      "2002:c000:0204::1",
      "64:ff9b::808:808",
    ];
    for (const address of blocked) {
      assert.equal(isPublicAddress(address), false, address);
    }
  });

  it("evaluates IPv4-mapped IPv6 addresses by their IPv4 value", () => {
    assert.equal(isPublicAddress("::ffff:8.8.8.8"), true);
    assert.equal(isPublicAddress("::ffff:127.0.0.1"), false);
    assert.equal(isPublicAddress("::ffff:7f00:1"), false);
    assert.equal(isPublicAddress("::ffff:a00:1"), false);
    assert.equal(isPublicAddress("::ffff:808:808"), true);
  });

  it("accepts bracketed IPv6 and rejects non-IP input", () => {
    assert.equal(isPublicAddress("[2606:4700:4700::1111]"), true);
    assert.equal(isPublicAddress("[::1]"), false);
    assert.equal(isPublicAddress("example.com"), false);
    assert.equal(isPublicAddress(""), false);
    assert.equal(isPublicAddress("999.1.1.1"), false);
  });
});
