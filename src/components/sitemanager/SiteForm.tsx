import { useState } from "react";
import { Button } from "../ui/Button";
import { Checkbox, FieldRow, Input, Select } from "../ui/Field";
import { defaultPortFor, emptySecret, type AuthMethod, type Protocol, type SiteProfile } from "../../lib/types";

interface SiteFormProps {
  initial: SiteProfile;
  onCancel: () => void;
  onSave: (profile: SiteProfile) => void;
  onConnect?: (profile: SiteProfile) => void;
  /** "quick" hides the persistent "Save" button - only a single "Connect" action. */
  mode?: "manage" | "quick";
}

export function SiteForm({ initial, onCancel, onSave, onConnect, mode = "manage" }: SiteFormProps) {
  const [profile, setProfile] = useState<SiteProfile>(initial);
  const authKind = profile.auth.kind;

  const update = <K extends keyof SiteProfile>(key: K, value: SiteProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  const setAuth = (auth: AuthMethod) => setProfile((p) => ({ ...p, auth }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(profile);
      }}
    >
      <FieldRow label="Name">
        <Input value={profile.name} onChange={(e) => update("name", e.target.value)} placeholder="My server" required />
      </FieldRow>

      <div className="mb-3 grid grid-cols-[1fr_100px] gap-2">
        <FieldRow label="Protocol">
          <Select
            value={profile.protocol}
            onChange={(e) => {
              const protocol = e.target.value as Protocol;
              setProfile((p) => ({ ...p, protocol, port: defaultPortFor(protocol) }));
            }}
          >
            <option value="sftp">SFTP</option>
            <option value="scp">SCP</option>
            <option value="ftp">FTP</option>
            <option value="ftps">FTPS</option>
          </Select>
        </FieldRow>
        <FieldRow label="Port">
          <Input
            type="number"
            value={profile.port}
            onChange={(e) => update("port", Number(e.target.value))}
          />
        </FieldRow>
      </div>

      <FieldRow label="Host">
        <Input value={profile.host} onChange={(e) => update("host", e.target.value)} placeholder="example.com" required />
      </FieldRow>

      <FieldRow label="Username">
        <Input value={profile.username} onChange={(e) => update("username", e.target.value)} required />
      </FieldRow>

      {(profile.protocol === "sftp" || profile.protocol === "scp") && (
        <FieldRow label="Authentication">
          <Select
            value={authKind}
            onChange={(e) => {
              const kind = e.target.value as AuthMethod["kind"];
              if (kind === "password") setAuth({ kind, password: emptySecret() });
              else if (kind === "private_key") setAuth({ kind, key_path: "", passphrase: emptySecret() });
              else setAuth({ kind: "agent" });
            }}
          >
            <option value="password">Password</option>
            <option value="private_key">Private key</option>
            <option value="agent">SSH agent</option>
          </Select>
        </FieldRow>
      )}

      {profile.auth.kind === "password" && (
        <FieldRow label="Password">
          <Input
            type="password"
            value={profile.auth.password.value}
            onChange={(e) => setAuth({ kind: "password", password: { value: e.target.value, is_encrypted: false } })}
          />
        </FieldRow>
      )}

      {profile.auth.kind === "private_key" && (
        <>
          <FieldRow label="Private key path">
            <Input
              value={profile.auth.key_path}
              onChange={(e) => {
                const auth = profile.auth as Extract<AuthMethod, { kind: "private_key" }>;
                setAuth({ kind: "private_key", key_path: e.target.value, passphrase: auth.passphrase });
              }}
              placeholder="C:\Users\you\.ssh\id_ed25519"
            />
          </FieldRow>
          <FieldRow label="Key passphrase (optional)">
            <Input
              type="password"
              value={profile.auth.passphrase.value}
              onChange={(e) => {
                const auth = profile.auth as Extract<AuthMethod, { kind: "private_key" }>;
                setAuth({
                  kind: "private_key",
                  key_path: auth.key_path,
                  passphrase: { value: e.target.value, is_encrypted: false },
                });
              }}
            />
          </FieldRow>
        </>
      )}

      {(profile.protocol === "ftp" || profile.protocol === "ftps") && profile.auth.kind !== "password" && (
        <FieldRow label="Password">
          <Input
            type="password"
            value=""
            onChange={(e) => setAuth({ kind: "password", password: { value: e.target.value, is_encrypted: false } })}
          />
        </FieldRow>
      )}

      {profile.protocol === "ftps" && (
        <FieldRow label="FTPS mode">
          <Select value={profile.ftps_mode} onChange={(e) => update("ftps_mode", e.target.value as any)}>
            <option value="explicit">Explicit (AUTH TLS) — recommended</option>
            <option value="implicit">Implicit (port 990)</option>
          </Select>
        </FieldRow>
      )}

      <FieldRow label="Remote directory (optional)">
        <Input value={profile.remote_dir ?? ""} onChange={(e) => update("remote_dir", e.target.value || null)} placeholder="/home/you" />
      </FieldRow>

      <div className="mb-3 flex flex-col gap-2">
        {(profile.protocol === "ftp" || profile.protocol === "ftps") && (
          <Checkbox
            label="Use passive mode"
            checked={profile.passive_ftp}
            onChange={(e) => update("passive_ftp", e.target.checked)}
          />
        )}
        {(profile.protocol === "sftp" || profile.protocol === "scp") && (
          <Checkbox
            label="Verify host key (recommended)"
            checked={profile.verify_host_key}
            onChange={(e) => update("verify_host_key", e.target.checked)}
          />
        )}
      </div>

      <div className="mt-4 flex justify-between gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {mode === "manage" && (
            <Button type="submit" variant="secondary">
              Save
            </Button>
          )}
          {onConnect && (
            <Button type="button" variant="primary" onClick={() => onConnect(profile)}>
              {mode === "quick" ? "Connect" : "Save & Connect"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
