export const onRequestPost: PagesFunction = async ({ request }) => {
  const form = await request.formData();
  const name = String(form.get('name') || '');
  const email = String(form.get('email') || '');
  const message = String(form.get('message') || '');

  const body = {
    personalizations: [{ to: [{ email: 'info@tagtweaktest.com' }] }],
    from: { email: 'no-reply@tagtweaktest.com' },
    subject: `Contact form submission from ${name}`,
    content: [
      {
        type: 'text/plain',
        value: `From: ${name} <${email}>\n\n${message}`,
      },
    ],
  };

  await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return new Response('Message sent');
};
