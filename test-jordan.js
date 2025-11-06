async function testJordan() {
  try {
    const response = await fetch('https://briloai.vercel.app/api/releases?brand=Jordan&limit=5');
    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testJordan();