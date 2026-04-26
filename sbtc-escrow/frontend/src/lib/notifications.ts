/**
 * Browser Notifications API helper.
 * Wraps permission state and notification dispatch with safe checks.
 */

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermission(): NotificationPermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

interface FireOptions {
  body?: string;
  tag?: string;
  url?: string;
}

export function fireNotification(title: string, options: FireOptions = {}) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const n = new Notification(title, {
    body: options.body,
    tag: options.tag,
    icon: '/favicon.ico',
  });

  if (options.url) {
    n.onclick = () => {
      window.focus();
      window.location.href = options.url!;
      n.close();
    };
  }
}
