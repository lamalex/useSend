"use client";

import { useState } from "react";
import { Button } from "@usesend/ui/src/button";
import { Input } from "@usesend/ui/src/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@usesend/ui/src/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@usesend/ui/src/select";
import {
  CheckIcon,
  ClipboardCopy,
  Download,
  Eye,
  EyeOff,
  Plus,
} from "lucide-react";
import { toast } from "@usesend/ui/src/toaster";
import { api } from "~/trpc/react";
import { generateMobileConfig } from "./mobileconfig";

// Common IMAP providers for piggybacking
const IMAP_PROVIDERS = [
  { name: "iCloud", host: "imap.mail.me.com", port: 993 },
  { name: "Gmail", host: "imap.gmail.com", port: 993 },
  { name: "Fastmail", host: "imap.fastmail.com", port: 993 },
  { name: "Custom", host: "", port: 993 },
];

interface GenerateSmtpPasswordProps {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
}

export default function GenerateSmtpPassword({
  smtpHost,
  smtpPort,
  smtpUser,
}: GenerateSmtpPasswordProps) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [keyName, setKeyName] = useState("");
  const [emailLocalPart, setEmailLocalPart] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // IMAP settings for mobileconfig
  const [imapProvider, setImapProvider] = useState("");
  const [customImapHost, setCustomImapHost] = useState("");
  const [imapUser, setImapUser] = useState("");

  const createApiKeyMutation = api.apiKey.createToken.useMutation();
  const { data: domains } = api.domain.domains.useQuery();
  const utils = api.useUtils();

  const verifiedDomains = domains?.filter((d) => d.status === "SUCCESS") ?? [];

  const selectedImapProvider = IMAP_PROVIDERS.find(
    (p) => p.name === imapProvider,
  );
  const imapHost =
    imapProvider === "Custom"
      ? customImapHost
      : (selectedImapProvider?.host ?? "");
  const imapPort = selectedImapProvider?.port ?? 993;

  function handleGenerateKey() {
    if (!keyName.trim()) {
      toast.error("Please enter a name for your API key");
      return;
    }

    createApiKeyMutation.mutate(
      {
        name: keyName.trim(),
        permission: "FULL",
      },
      {
        onSuccess: (data) => {
          utils.apiKey.invalidate();
          setApiKey(data);
        },
        onError: () => {
          toast.error("Failed to generate API key");
        },
      },
    );
  }

  function handleCopy() {
    navigator.clipboard.writeText(apiKey);
    setIsCopied(true);
    setTimeout(() => {
      setIsCopied(false);
    }, 2000);
  }

  function handleClose() {
    setApiKey("");
    setKeyName("");
    setEmailLocalPart("");
    setSelectedDomain("");
    setImapProvider("");
    setCustomImapHost("");
    setImapUser("");
    setOpen(false);
    setShowApiKey(false);
  }

  function copyAndClose() {
    handleCopy();
    handleClose();
    toast.success("API key copied to clipboard");
  }

  function handleOpenChange(_open: boolean) {
    if (_open !== open) {
      setOpen(_open);
      if (!_open) {
        handleClose();
      }
    }
  }

  function handleDownloadMobileConfig() {
    if (!emailLocalPart.trim() || !selectedDomain) {
      toast.error("Please enter an email address");
      return;
    }
    if (!imapHost) {
      toast.error("Please select an IMAP provider");
      return;
    }
    if (!imapUser.trim()) {
      toast.error("Please enter your IMAP username");
      return;
    }

    const emailAddress = `${emailLocalPart.trim()}@${selectedDomain}`;

    const config = generateMobileConfig({
      emailAddress,
      smtpHost,
      smtpPort,
      smtpUser,
      accountName: keyName,
      imapHost,
      imapPort,
      imapUser: imapUser.trim(),
    });

    const blob = new Blob([config], {
      type: "application/x-apple-aspen-config",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usesend-smtp-${emailLocalPart}.mobileconfig`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Mobileconfig downloaded");
  }

  const canDownload =
    emailLocalPart.trim() && selectedDomain && imapHost && imapUser.trim();

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-1" />
          Generate SMTP Password
        </Button>
      </DialogTrigger>
      {apiKey ? (
        <DialogContent key={apiKey} className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Your SMTP password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Use this API key as your SMTP password. Make sure to copy it now -
            you won&apos;t be able to see it again.
          </p>
          <div className="py-1 bg-secondary rounded-lg px-4 flex items-center justify-between mt-2">
            <div className="overflow-hidden">
              {showApiKey ? (
                <p className="text-sm font-mono break-all">{apiKey}</p>
              ) : (
                <div className="flex gap-1">
                  {Array.from({ length: 40 }).map((_, index) => (
                    <div
                      key={index}
                      className="w-1 h-1 bg-muted-foreground rounded-lg"
                    />
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-4 ml-2 shrink-0">
              <Button
                variant="ghost"
                className="hover:bg-transparent p-0 cursor-pointer"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                className="hover:bg-transparent p-0 cursor-pointer"
                onClick={handleCopy}
              >
                {isCopied ? (
                  <CheckIcon className="h-4 w-4 text-green-500" />
                ) : (
                  <ClipboardCopy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="border-t pt-4 mt-2">
            <p className="text-sm font-medium mb-2">Setup on iPhone/iPad</p>
            <p className="text-xs text-muted-foreground mb-3">
              Download a configuration profile to set up this SMTP account on
              your iOS device. iOS requires an incoming mail server, so
              you&apos;ll piggyback on an existing email account.
            </p>
            {verifiedDomains.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No verified domains available. Please add and verify a domain
                first.
              </p>
            ) : (
              <div className="space-y-3">
                {/* From email */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    From Address
                  </label>
                  <div className="flex items-center mt-1">
                    <Input
                      placeholder="hello"
                      value={emailLocalPart}
                      onChange={(e) => setEmailLocalPart(e.target.value)}
                      className="rounded-r-none"
                    />
                    <span className="px-2 py-2 bg-muted border-y text-muted-foreground text-sm">
                      @
                    </span>
                    <Select
                      value={selectedDomain}
                      onValueChange={setSelectedDomain}
                    >
                      <SelectTrigger className="rounded-l-none min-w-[160px]">
                        <SelectValue placeholder="Select domain" />
                      </SelectTrigger>
                      <SelectContent>
                        {verifiedDomains.map((domain) => (
                          <SelectItem key={domain.id} value={domain.name}>
                            {domain.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* IMAP Provider */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground">
                    Receive Mail Via (IMAP)
                  </label>
                  <Select value={imapProvider} onValueChange={setImapProvider}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select your email provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAP_PROVIDERS.map((provider) => (
                        <SelectItem key={provider.name} value={provider.name}>
                          {provider.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Custom IMAP Host */}
                {imapProvider === "Custom" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      IMAP Server
                    </label>
                    <Input
                      className="mt-1"
                      placeholder="imap.example.com"
                      value={customImapHost}
                      onChange={(e) => setCustomImapHost(e.target.value)}
                    />
                  </div>
                )}

                {/* IMAP Username */}
                {imapProvider && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      IMAP Username
                    </label>
                    <Input
                      className="mt-1"
                      placeholder={
                        imapProvider === "iCloud"
                          ? "you@icloud.com"
                          : "your-email@example.com"
                      }
                      value={imapUser}
                      onChange={(e) => setImapUser(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      You&apos;ll be prompted for passwords when installing the
                      profile.
                    </p>
                    {imapProvider === "iCloud" && (
                      <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                        If you have 2FA enabled, you&apos;ll need an{" "}
                        <a
                          href="https://support.apple.com/en-us/102654"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          app-specific password
                        </a>{" "}
                        for iCloud.
                      </p>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  onClick={handleDownloadMobileConfig}
                  disabled={!canDownload}
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download Mobileconfig
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
            <Button onClick={copyAndClose}>Copy & Close</Button>
          </DialogFooter>
        </DialogContent>
      ) : (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate SMTP Password</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will create a new API key that you can use as your SMTP
            password.
          </p>
          <div className="py-2">
            <label className="text-sm font-medium">Key name</label>
            <Input
              className="mt-1"
              placeholder="e.g., SMTP Production"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleGenerateKey();
                }
              }}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Use a name to easily identify this key.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={handleGenerateKey}
              disabled={createApiKeyMutation.isPending || !keyName.trim()}
            >
              {createApiKeyMutation.isPending ? "Generating..." : "Generate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
