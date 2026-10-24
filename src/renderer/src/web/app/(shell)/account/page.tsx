// app/account/page.tsx
import { redirect } from 'next/navigation';

export default function AccountPage() {
  redirect('/account/organizations');
}
