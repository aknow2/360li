include <BOSL2/std.scad>
$fn=128;
N=24;


module stall(){
    path = circle(r=60, $fn=N);
theta = lerpn(0,360,N,endpoint=false);
scale = [for(t=theta) sin(8*t)/5+1.2];
    
path_sweep(circle(r=20, $fn=6), path3d(path), closed=true, scale=scale);

rotate([0,0,20])
translate([0,0,-8]) {
   
path = circle(r=55, $fn=N);
theta = lerpn(0,360,N,endpoint=false);
scale = [for(t=theta) sin(8*t)/5+1];

difference() {
path_sweep(circle(r=20, $fn=6), path3d(path), closed=true, scale=scale);

}
}
translate([0,0,-26])
scale([1,1,1/3])
cylinder(r=65,h=20, center=true);

}



translate([0,0,20])
difference(){
torus(r_maj=52, r_min=12);

}


difference(){
 stall();
count =360;



cylinder(d=90,h=200,center=true,$fn=128);
     translate([0,0,-22])
 rotate([90,0,0])

    cylinder(r=30,h=200, $fn=6);


}




