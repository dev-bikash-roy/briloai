async function testAPI() {
  try {
    const response = await fetch('https://briloai.vercel.app/api/releases?limit=5');
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testAPI();