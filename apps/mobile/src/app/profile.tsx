import { useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { api, hooks } from '@/lib/api';
import { useAuth } from '@/lib/auth-store';
import { errMsg } from '@/lib/format';
import { signOut } from '@/lib/session';
import { RequireAuth } from '@/components/gate';
import { Button, Card, Field, PasswordField, Screen, ScreenHeader } from '@/components/ui';

function ProfileForm() {
  const user = useAuth((s) => s.user);
  const setUser = useAuth((s) => s.setUser);
  const update = hooks.useUpdateProfile();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setPhone(user?.phone ?? '');
  }, [user?.name, user?.phone]);

  const save = () =>
    update.mutate(
      { name: name.trim(), phone: phone.trim() || undefined },
      {
        onSuccess: (u) => {
          setUser(u);
          Alert.alert('Saved', 'Your profile was updated.');
        },
        onError: (e) => Alert.alert('Could not save', errMsg(e)),
      },
    );

  const changePassword = async () => {
    setBusy(true);
    try {
      await api.auth.changePassword(current, next);
      setCurrent('');
      setNext('');
      Alert.alert('Password changed', 'Other devices have been signed out.');
    } catch (e) {
      Alert.alert('Could not change password', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const logoutAll = () =>
    Alert.alert('Sign out of all devices?', 'You will need to log in again everywhere.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out everywhere',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.auth.logoutAll();
          } catch {
            /* still sign out locally */
          }
          await signOut();
        },
      },
    ]);

  return (
    <Screen scroll edges={[]} contentClassName="gap-4 p-4 pb-10">
      <Card className="gap-4">
        <Text className="text-base font-bold text-foreground">Personal details</Text>
        <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Field
          label="Email"
          value={user?.email ?? ''}
          editable={false}
          hint={user?.emailVerified ? 'Verified' : 'Email not verified yet'}
        />
        <Field
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={10}
        />
        <Button
          title="Save changes"
          loading={update.isPending}
          disabled={name.trim().length < 2}
          onPress={save}
        />
      </Card>
      {user?.email ? (
        <Card className="gap-4">
          <Text className="text-base font-bold text-foreground">Change password</Text>
          <PasswordField label="Current password" value={current} onChangeText={setCurrent} />
          <PasswordField
            label="New password"
            value={next}
            onChangeText={setNext}
            hint="Min 8 characters with a letter and a number."
          />
          <Button
            title="Update password"
            variant="outline"
            loading={busy}
            disabled={!current || next.length < 8}
            onPress={changePassword}
          />
        </Card>
      ) : null}
      <View className="gap-3">
        <Button
          title="Sign out of all devices"
          variant="outline"
          icon="log-out-outline"
          onPress={logoutAll}
        />
      </View>
    </Screen>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  return (
    <Screen>
      <ScreenHeader title="Profile and security" onBack={() => router.back()} />
      <RequireAuth next="/profile">
        <ProfileForm />
      </RequireAuth>
    </Screen>
  );
}
