const Blog = require('../models/Blog');
const { validationResult } = require('express-validator');

/**
 * Create blog post (admin only)
 */
const createBlog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { title, content, excerpt, featuredImage, tags, category, published, buttonType } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const blog = await Blog.create({
      title,
      content,
      excerpt,
      featuredImage,
      tags: tags || [],
      category,
      published: published || false,
      buttonType: buttonType || null,
      author: adminId
    });

    await blog.populate('author', 'fullName email role');

    res.status(201).json({
      success: true,
      message: 'Blog post created successfully',
      data: {
        blog
      }
    });

  } catch (error) {
    console.error('Create blog error:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Blog post with this title already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all blog posts (published only for public, all for admin)
 */
const getAllBlogs = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, published, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const isAdmin = req.admin?.adminId;

    const query = {};
    
    // Non-admins only see published blogs
    if (!isAdmin) {
      query.published = true;
    } else if (published !== undefined) {
      query.published = published === 'true';
    }
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { content: { $regex: search, $options: 'i' } },
        { excerpt: { $regex: search, $options: 'i' } }
      ];
    }

    const [blogs, total] = await Promise.all([
      Blog.find(query)
        .populate('author', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Blog.countDocuments(query)
    ]);

    res.status(200).json({
      success: true,
      message: 'Blog posts retrieved successfully',
      data: {
        blogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get all blogs error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving blog posts',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get blog post by ID or slug
 */
const getBlogById = async (req, res) => {
  try {
    const { blogId } = req.params;
    const isAdmin = req.admin?.adminId;

    const query = {
      $or: [
        { _id: blogId },
        { slug: blogId }
      ]
    };

    // Non-admins only see published blogs
    if (!isAdmin) {
      query.published = true;
    }

    const blog = await Blog.findOne(query)
      .populate('author', 'fullName email role');

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Increment views
    blog.views = (blog.views || 0) + 1;
    await blog.save();

    res.status(200).json({
      success: true,
      message: 'Blog post retrieved successfully',
      data: {
        blog
      }
    });

  } catch (error) {
    console.error('Get blog by ID error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update blog post (admin only)
 */
const updateBlog = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { blogId } = req.params;
    const { title, content, excerpt, featuredImage, tags, category, published, buttonType } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Update fields
    if (title !== undefined) blog.title = title;
    if (content !== undefined) blog.content = content;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (featuredImage !== undefined) blog.featuredImage = featuredImage;
    if (tags !== undefined) blog.tags = tags;
    if (category !== undefined) blog.category = category;
    if (buttonType !== undefined) blog.buttonType = buttonType || null;
    if (published !== undefined) {
      blog.published = published;
      if (published && !blog.publishedAt) {
        blog.publishedAt = Date.now();
      }
    }

    await blog.save();
    await blog.populate('author', 'fullName email role');

    res.status(200).json({
      success: true,
      message: 'Blog post updated successfully',
      data: {
        blog
      }
    });

  } catch (error) {
    console.error('Update blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete blog post (admin only)
 */
const deleteBlog = async (req, res) => {
  try {
    const adminId = req.admin?.adminId;
    const { blogId } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const blog = await Blog.findById(blogId);
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    await Blog.findByIdAndDelete(blogId);

    res.status(200).json({
      success: true,
      message: 'Blog post deleted successfully'
    });

  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting blog post',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog
};

