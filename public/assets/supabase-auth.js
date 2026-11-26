import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = document.querySelector('meta[name="supabase-url"]')?.content;
const supabaseAnonKey = document.querySelector('meta[name="supabase-anon-key"]')?.content;

const form = document.getElementById('accountForm');
const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

if (form) {
  const tabs = [...document.querySelectorAll('[data-account-tab]')];
  const submitButton = document.getElementById('accountSubmit');
  const message = document.getElementById('accountMessage');
  const passwordInput = form.querySelector('[name="password"]');
  const emailInput = form.querySelector('[name="email"]');
  const nameField = document.getElementById('registerNameField');
  const nameInput = form.querySelector('[name="full_name"]');
  const forgotButton = document.getElementById('forgotPassword');
  let mode = 'signin';
  let busy = false;

  function showMessage(text, type = 'info') {
    message.textContent = text;
    message.dataset.state = type;
    message.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }

  if (!supabase) {
    submitButton.disabled = true;
    forgotButton.disabled = true;
    showMessage('Account sign-in is unavailable until Supabase is configured.');
  } else {
    function setMode(nextMode) {
      mode = nextMode;
      tabs.forEach((tab) => {
        const active = tab.dataset.accountTab === mode;
        tab.classList.toggle('active', active);
        tab.setAttribute('aria-pressed', String(active));
      });

      const registering = mode === 'register';
      nameField.hidden = !registering;
      nameInput.required = registering;
      passwordInput.autocomplete = registering ? 'new-password' : 'current-password';
      submitButton.textContent = registering ? 'Create account' : 'Sign in';
      forgotButton.hidden = registering;
      showMessage(registering
        ? 'Create an account to save your shopping favourites.'
        : 'Sign in to your Lovely Girl account.');
    }

    tabs.forEach((tab) => {
      tab.addEventListener('click', () => setMode(tab.dataset.accountTab));
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (busy) return;

      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const fullName = nameInput.value.trim();

      if (mode === 'register' && !fullName) {
        showMessage('Please enter your full name.', 'error');
        nameInput.focus();
        return;
      }

      busy = true;
      submitButton.disabled = true;
      showMessage(mode === 'register' ? 'Creating your account…' : 'Signing you in…');

      try {
        if (mode === 'register') {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { full_name: fullName },
              emailRedirectTo: `${window.location.origin}/login`
            }
          });

          if (error) throw error;

          if (data.session) {
            showMessage('Your account is ready. Welcome to Lovely Girl!');
            window.location.assign('/');
          } else {
            showMessage('Your account has been created. Please check your email for a confirmation link before signing in.', 'success');
            setMode('signin');
          }
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) throw error;
          showMessage('You are signed in. Welcome back!');
          window.location.assign('/');
        }
      } catch (error) {
        showMessage(error?.message || 'Authentication failed. Please try again.', 'error');
      } finally {
        busy = false;
        submitButton.disabled = false;
      }
    });

    forgotButton.addEventListener('click', async () => {
      const email = emailInput.value.trim();
      if (!email) {
        showMessage('Enter your email address first, then choose Forgot password.', 'error');
        emailInput.focus();
        return;
      }

      forgotButton.disabled = true;
      showMessage('Sending password reset email…');
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`
        });
        if (error) throw error;
        showMessage('If an account exists for that email, a password reset link will be sent.', 'success');
      } catch (error) {
        showMessage(error?.message || 'Could not send the reset email. Please try again.', 'error');
      } finally {
        forgotButton.disabled = false;
      }
    });

    setMode('signin');
  }
}
