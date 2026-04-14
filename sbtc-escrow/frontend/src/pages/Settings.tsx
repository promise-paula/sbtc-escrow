import React from 'react';
import { motion } from 'framer-motion';
import { useWallet } from '@/contexts/WalletContext';
import { useTheme } from '@/contexts/ThemeContext';
import { usePlatformConfig } from '@/hooks/use-admin';
import { useSettings } from '@/hooks/use-settings';
import { CONTRACT_ADDRESS, CONTRACT_NAME, STACKS_NETWORK } from '@/lib/stacks-config';
import { cardVariants } from '@/lib/motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AddressDisplay } from '@/components/shared/AddressDisplay';
import { Separator } from '@/components/ui/separator';
import { Wallet, Settings2, Info, ExternalLink, LogOut, RotateCcw } from 'lucide-react';
import { blocksToTime, getExplorerUrl } from '@/lib/utils';
import { useBlockRate } from '@/hooks/use-block-rate';
import { toast } from 'sonner';

export default function SettingsPage() {
  const { address, isConnected, connect, disconnect } = useWallet();
  const { theme, setTheme } = useTheme();
  const { data: config } = usePlatformConfig();
  const { data: blockRate } = useBlockRate();
  const minutesPerBlock = blockRate?.minutesPerBlock ?? 10;
  const { settings, update, reset } = useSettings();

  const handleReset = () => {
    reset();
    toast.success('All settings reset to defaults');
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-foreground tracking-tight">Settings</h1>

      {/* Wallet Management */}
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
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Network</p>
                  <p className="text-sm capitalize">{STACKS_NETWORK}</p>
                </div>
                <Button variant="outline" size="sm" onClick={disconnect} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
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

      {/* Preferences */}
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
                {(['light', 'dark', 'system'] as const).map(t => (
                  <Button key={t} variant={theme === t ? 'default' : 'outline'} size="sm" onClick={() => setTheme(t)} className="capitalize">
                    {t}
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Display Options */}
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground">Display</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="compact" className="text-sm">Compact table rows</Label>
                <Switch id="compact" checked={settings.compactRows} onCheckedChange={v => update('compactRows', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="usd" className="text-sm">Show USD estimates</Label>
                <Switch id="usd" checked={settings.showUsd} onCheckedChange={v => update('showUsd', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="currency" className="text-sm">Default currency</Label>
                <Select value={settings.currency} onValueChange={v => update('currency', v as 'STX' | 'microSTX')}>
                  <SelectTrigger className="w-32 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="STX">STX</SelectItem>
                    <SelectItem value="microSTX">microSTX</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            {/* Notifications */}
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground">Notifications</p>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-confirm" className="text-sm">Transaction confirmations</Label>
                <Switch id="notif-confirm" checked={settings.notifyConfirmations} onCheckedChange={v => update('notifyConfirmations', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-dispute" className="text-sm">Dispute alerts</Label>
                <Switch id="notif-dispute" checked={settings.notifyDisputes} onCheckedChange={v => update('notifyDisputes', v)} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="notif-expiry" className="text-sm">Escrow expiry reminders</Label>
                <Switch id="notif-expiry" checked={settings.notifyExpiry} onCheckedChange={v => update('notifyExpiry', v)} />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* About */}
      <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariants}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Info className="h-4 w-4 text-muted-foreground" /> About
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border divide-y divide-border text-sm">
              <div className="flex justify-between p-3"><span className="text-muted-foreground">Version</span><span className="font-mono">v4.0.0</span></div>
              <div className="flex justify-between gap-3 p-3"><span className="text-muted-foreground shrink-0">Contract</span><span className="font-mono text-xs truncate">{CONTRACT_ADDRESS}.{CONTRACT_NAME}</span></div>
              <div className="flex justify-between p-3"><span className="text-muted-foreground">Network</span><span className="capitalize">{STACKS_NETWORK}</span></div>
              <div className="flex justify-between p-3"><span className="text-muted-foreground">Platform Fee</span><span>{config ? config.platformFeeBps / 100 : '—'}%</span></div>
              <div className="flex justify-between p-3"><span className="text-muted-foreground">Dispute Timeout</span><span>{config ? `${config.disputeTimeout.toLocaleString()} blocks (~${blocksToTime(config.disputeTimeout, minutesPerBlock)})` : '—'}</span></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href={getExplorerUrl('tx', `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`)} target="_blank" rel="noopener noreferrer" className="gap-1.5">
                  <ExternalLink className="h-3.5 w-3.5" /> View Contract
                </a>
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                <RotateCcw className="h-3.5 w-3.5" /> Reset All Settings
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
