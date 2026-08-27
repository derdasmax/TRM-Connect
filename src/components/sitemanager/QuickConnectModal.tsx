import { Modal } from "../ui/Modal";
import { SiteForm } from "./SiteForm";
import { newSiteProfile, type SiteProfile } from "../../lib/types";

interface QuickConnectModalProps {
  open: boolean;
  onClose: () => void;
  onConnect: (profile: SiteProfile) => void;
}

export function QuickConnectModal({ open, onClose, onConnect }: QuickConnectModalProps) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onClose} title="Quick Connect" width={440}>
      <SiteForm
        initial={newSiteProfile()}
        mode="quick"
        onCancel={onClose}
        onSave={() => {}}
        onConnect={onConnect}
      />
    </Modal>
  );
}
