import multer from "multer"

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      
      let customer = req.headers.customer || "products"
      cb(null, `./public/${customer}`)      
      
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
      var parts = file?.originalname.split('.');
      
      
      var extension = parts[parts.length - 1];
      
      
      console.log("file",uniqueSuffix + "." + extension.toLowerCase());
      
      cb(null, uniqueSuffix + "." + extension.toLowerCase() )
    }
  })
  
  export const uploadP = multer({ dest: 'uploads/' })