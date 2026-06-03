import fetch from 'node-fetch';

const testRoutes = async () => {
  try {
    // Login first
    const loginRes = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '@Admin', password: 'TedxYola2026' })
    });
    
    if (!loginRes.ok) {
      console.log('❌ Login failed:', loginRes.status);
      return;
    }
    
    const { token } = await loginRes.json();
    console.log('✓ Login successful');
    
    // Test sponsors route
    const sponsorsRes = await fetch('http://localhost:5000/api/sponsors', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Sponsors response status:', sponsorsRes.status);
    
    if (sponsorsRes.ok) {
      const sponsors = await sponsorsRes.json();
      console.log('✓ Sponsors route works! Count:', sponsors.length);
    } else {
      const text = await sponsorsRes.text();
      console.log('❌ Sponsors route failed:', text);
    }
    
    // Test blogs route
    const blogsRes = await fetch('http://localhost:5000/api/blogs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    console.log('Blogs response status:', blogsRes.status);
    
    if (blogsRes.ok) {
      const blogs = await blogsRes.json();
      console.log('✓ Blogs route works! Count:', blogs.length);
    } else {
      const text = await blogsRes.text();
      console.log('❌ Blogs route failed:', text);
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
};

testRoutes();
