bottom_h =6;
space_h=15;
roof_h=bottom_h;

hole=25;

difference() {
 cube([40, 50,bottom_h+space_h+roof_h], center=true);
 translate([0,6,0])
 cube([40, 50, space_h], center=true);
 
 translate([0,7,0]) {
 translate([0,0,space_h/2+roof_h/2])
 cylinder(d=hole,h=2);
 cylinder(d=20,h=20);    
 }   
 
}
