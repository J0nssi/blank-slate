import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // Await the cookies() to ensure you get the correct cookie values
  const cookieStore = await cookies();
  
  // Get locale from the cookie (default to 'en' if not found)
  const locale = cookieStore.get('locale')?.value || 'en';

  // Return the locale and its corresponding messages
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
