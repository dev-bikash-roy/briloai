import { fetchElfsightReleases } from './api/elfsight-fetcher.js';

async function testElfsightIntegration() {
  console.log('Testing Elfsight widget integration...');
  
  try {
    const releases = await fetchElfsightReleases();
    console.log(`Successfully fetched ${releases.length} releases from Elfsight widget`);
    
    if (releases.length > 0) {
      console.log('First release:', JSON.stringify(releases[0], null, 2));
    }
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Error testing Elfsight integration:', error);
  }
}

testElfsightIntegration();