/**
 * /admin — root redirect.
 *
 * Sends visitors to the dashboard so `/admin` is a valid entry point. The
 * admin layout still guards role access one level up.
 */
import { redirect } from 'next/navigation';

export default function AdminIndexPage() {
  redirect('/admin/dashboard');
}
