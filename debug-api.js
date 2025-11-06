async function debugAPI() {
  try {
    const response = await fetch('https://briloai.vercel.app/api/releases?limit=5');
    console.log('Status:', response.status);
    console.log('Headers:', [...response.headers.entries()]);
    const text = await response.text();
    console.log('Response body:', text);
  } catch (error) {
    console.error('Error:', error);
  }
}

debugAPI();