import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePlatformConfig } from '@/hooks/use-admin';
import { useEscrows } from '@/hooks/use-escrow';
import { useSettings } from '@/hooks/use-settings';
import { useAddressBook } from '@/hooks/use-address-book';
import { useBlockRate } from '@/hooks/use-block-rate';
import {
  CONTRACT_ADDRESS,
  CONTRACT_NAME,
  CONTRACT_PRINCIPAL,
  STACKS_NETWORK,
  DEFAULT_MINUTES_PER_BLOCK,
  BURN_BLOCK_MINUTES,
  usesBurnBlockClock,
} from '@/lib/stacks-config';
import { cardVariants } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { Separator } from '@/components/ui/separator';
import {
  Wallet,
  Settings2,
  Info,
  ExternalLink,
  LogOut,
  RotateCcw,
  BookUser,
  Download,
  AlertTriangle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  blocksToTime,
  getExplorerUrl,
  getAddressNetwork,
  isValidStacksAddress,
  truncateAddress,
} from '@/lib/utils';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '@/lib/notifications';
import { escrowsToCsv, downloadCsv } from '@/lib/csv-export';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { address, isConnected, connect, disconnect } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: config } = usePlatformConfig();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? DEFAULT_MINUTES_PER_BLOCK;
  const { settings, update, reset } = useSettings();
  const { entries: contacts, add: addContact, remove: removeContact } = useAddressBook();
  const { data: userEscrows } = useEscrows(address);

  const [permission, setPermission] = useState<NotificationPermissionState>('default');

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, []);

  const handleNotificationToggle = async (
    key: 'notifyConfirmations' | 'notifyDisputes' | 'notifyDeliveries',
    value: boolean,
  ) => {
    if (value && permission === 'default') {
      const result = await requestNotificationPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast.error('Notifications blocked', {
          description:
            'Enable notifications for this site in your browser to receive alerts.',
        });
        return;
      }
    }
    if (value && (permission === 'denied' || permission === 'unsupported')) {
      return;
    }
    update(key, value);
  };

  const handleReset = () => {
    reset();
    toast.success('Settings reset', { description: 'All preferences are back to defaults.' });
  };

  const handleExportCsv = () => {
    if (!userEscrows || userEscrows.length === 0) {
      toast.error('Nothing to export', {
        description: "You don't have any escrows yet.",
      });
      return;
    }
    const csv = escrowsToCsv(userEscrows);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsv(`sbtc-escrows-${date}.csv`, csv);
    toast.success('Export ready', {
      description: `${userEscrows.length} escrow${userEscrows.length === 1 ? '' : 's'} downloaded.`,
    });
  };

  const actualNetwork = address ? getAddressNetwork(address) : null;
  const networksMatch = actualNetwork === STACKS_NETWORK;

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">Settings</h1>

      {/* ── Wallet ─────────────────────────────────────────────── */}
      <motion.div custom={0} initial="hidden" animate="visible" variants={cardVariants}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Wallet className="h-4 w-4 text-muted-foreground" /> Wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isConnected && address ? (
              <>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Connected Address</p>
                  <AddressDisplay address={address} truncateChars={8} showExplorer />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Site Network</p>
                    <p className="text-sm capitalize">{STACKS_NETWORK}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Wallet Network</p>
                    <p className="text-sm capitalize flex items-center gap-1.5">
                      {actualNetwork ?? 'Unknown'}
                      {actualNetwork && !networksMatch && (
                        <AlertTriangle
                          className="h-3.5 w-3.5 text-destructive"
                          aria-label="Network mismatch"
                        />
                      )}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={disconnect}
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
                >
                  <LogOut className="h-3.5 w-3.5" /> Disconnect
                </Button>
              </>
            ) : (
              <div className="text-center py-4 space-y-3">
                <p className="text-sm text-muted-foreground">No wallet connected.</p>
                <Button onClick={connect} size="sm" className="gap-2">
                  <Wallet className="h-4 w-4" /> Connect Wallet
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Preferences ────────────────────────────────────────── */}
      <motion.div custom={1} initial="hidden" animate="visible" variants={cardVariants}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Settings2 className="h-4 w-4 text-muted-foreground" /> Preferences
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Theme */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Theme</p>
              <div className="flex gap-2">
                {(['light', 'dark', 'system'] as const).map((t) => (
                  <Button
                    key={t}
                    variant={theme === t ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setTheme(t)}
                    className="capitalize"
                  >
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Display */}
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground">Display</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="usd" className="text-sm">Show USD estimates</Label>
                <Switch
                  id="usd"
                  checked={settings.showUsd}
                  onCheckedChange={(v) => update('showUsd', v)}
                />
              </div>
            </div>

            <Separator />

            {/* Notifications */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Browser Notifications</p>
                <PermissionBadge permission={permission} />
              </div>
              {permission === 'denied' && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You blocked notifications for this site. Re-enable in your browser's site settings to use these alerts.
                </p>
              )}
              <p className="text-xs text-muted-foreground">As a buyer</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-delivery" className="text-sm">Seller delivery signals</Label>
                <Switch
                  id="notif-delivery"
                  checked={settings.notifyDeliveries && permission === 'granted'}
                  disabled={permission === 'denied' || permission === 'unsupported'}
                  onCheckedChange={(v) => handleNotificationToggle('notifyDeliveries', v)}
                />
              </div>
              <p className="text-xs text-muted-foreground pt-1">As either party</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-confirm" className="text-sm">Transaction confirmations</Label>
                <Switch
                  id="notif-confirm"
                  checked={settings.notifyConfirmations && permission === 'granted'}
                  disabled={permission === 'denied' || permission === 'unsupported'}
                  onCheckedChange={(v) => handleNotificationToggle('notifyConfirmations', v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-dispute" className="text-sm">Dispute alerts</Label>
                <Switch
                  id="notif-dispute"
                  checked={settings.notifyDisputes && permission === 'granted'}
                  disabled={permission === 'denied' || permission === 'unsupported'}
                  onCheckedChange={(v) => handleNotificationToggle('notifyDisputes', v)}
                />
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Notifications fire while this tab is open. Email alerts coming later.
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Address Book ───────────────────────────────────────── */}
      <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariants}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <BookUser className="h-4 w-4 text-muted-foreground" /> Address Book
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Save trusted counterparties to make creating escrows faster.
            </p>
            <AddContactForm onAdd={addContact} />
            {contacts.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                No saved addresses yet.
              </p>
            ) : (
              <div className="space-y-2">
                {contacts.map((c) => (
                  <div
                    key={c.address}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {truncateAddress(c.address, 8)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeContact(c.address)}
                      aria-label={`Remove ${c.name}`}
                      className="shrink-0"
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── About ──────────────────────────────────────────────── */}
      <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariants}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-muted-foreground" /> About
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              <Row label="Version" value="v5.0.0" mono />
              <Row label="Contract" value={`${CONTRACT_ADDRESS}.${CONTRACT_NAME}`} mono small />
              <Row label="Network" value={STACKS_NETWORK} capitalize />
              <Row label="Block Rate" value={`~${minutesPerBlock.toFixed(1)} min`} />
              <Row label="Platform Fee" value={config ? `${config.platformFeeBps / 100}%` : '—'} />
              <Row
                label="Dispute Timeout"
                value={
                  config
                    ? // v3+ contracts anchor dispute timeout to burn blocks
                      // (~4 min testnet / ~10 min mainnet). Legacy contracts
                      // use Stacks blocks (live-rate observed). Using the
                      // wrong rate here historically over-stated v3 timeouts
                      // by ~3-7×.
                      `${config.disputeTimeout.toLocaleString()} blocks (~${blocksToTime(
                        config.disputeTimeout,
                        usesBurnBlockClock(CONTRACT_PRINCIPAL) ? BURN_BLOCK_MINUTES : minutesPerBlock,
                      )})`
                    : '—'
                }
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a
                  href={getExplorerUrl('tx', `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> View Contract
                </a>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportCsv}
                disabled={!isConnected}
                className="gap-1.5"
              >
                <Download className="h-3.5 w-3.5" /> Export Escrows (CSV)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

function PermissionBadge({ permission }: { permission: NotificationPermissionState }) {
  if (permission === 'granted') {
    return (
      <span className="text-[10px] font-medium text-success bg-success/10 px-1.5 py-0.5 rounded">
        Allowed
      </span>
    );
  }
  if (permission === 'denied') {
    return (
      <span className="text-[10px] font-medium text-destructive bg-destructive/10 px-1.5 py-0.5 rounded">
        Blocked
      </span>
    );
  }
  if (permission === 'unsupported') {
    return (
      <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
        Not supported
      </span>
    );
  }
  return null;
}

function AddContactForm({ onAdd }: { onAdd: (name: string, address: string) => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedAddress = address.trim();
    if (!trimmedName) {
      setError('Name is required');
      return;
    }
    if (!isValidStacksAddress(trimmedAddress)) {
      setError('Not a valid Stacks address');
      return;
    }
    onAdd(trimmedName, trimmedAddress);
    setName('');
    setAddress('');
    setError(null);
    toast.success('Contact saved');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input
          placeholder="Name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          className="text-sm"
        />
        <Input
          placeholder="ST… or SP…"
          value={address}
          onChange={(e) => {
            setAddress(e.target.value);
            setError(null);
          }}
          className="text-sm font-mono"
        />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <Button type="submit" size="sm" variant="outline" className="gap-1.5 w-full">
        <Plus className="h-3.5 w-3.5" /> Add Contact
      </Button>
    </form>
  );
}

function Row({
  label,
  value,
  mono,
  capitalize,
  small,
}: {
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 p-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span
        className={[
          mono ? 'font-mono' : '',
          capitalize ? 'capitalize' : '',
          small ? 'text-xs truncate' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {value}
      </span>
    </div>
  );
}
