import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request, locals }) => {
  const form = await request.formData();
  const name = String(form.get('name') || '');
  const email = String(form.get('email') || '');
  const message = String(form.get('message') || '');

  const env = locals.runtime.env;

  try {
    await env.EMAIL.send({
      to: 'tagtweaktest@cardiff.marketing',
      from: { email: 'no-reply@tagtweaktest.com', name: 'Tag Tweak Test' },
      replyTo: email,
      subject: `Contact form submission from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
  } catch (error) {
    return Response.redirect(new URL('/contact?error=1', request.url), 303);
  }

  return Response.redirect(new URL('/contact?sent=1', request.url), 303);
};
